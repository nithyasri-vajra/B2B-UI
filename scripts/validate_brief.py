import io
import json
import sys
from datetime import date, datetime
from zipfile import ZipFile

from openpyxl import load_workbook
from openpyxl.utils.datetime import from_excel

MAX_UPLOAD = 5 * 1024 * 1024
MAX_EXPANDED = 25 * 1024 * 1024


def validate(content, client_name):
    with ZipFile(io.BytesIO(content)) as archive:
        if sum(entry.file_size for entry in archive.infolist()) > MAX_EXPANDED:
            raise ValueError("Workbook exceeds the expanded size limit.")
    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    issues = []
    fields = {}

    def issue(location, message, severity="Error"):
        issues.append(dict(location=location, message=message, severity=severity))

    def as_date(value):
        if isinstance(value, (int, float)):
            value = from_excel(value, workbook.epoch)
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        try:
            return date.fromisoformat(str(value).strip())
        except ValueError:
            return None

    try:
        sheets = {name.strip().casefold(): name for name in workbook.sheetnames}
        if "brief" not in sheets:
            issue("Workbook", "Add a Brief sheet with Field and Value columns.")
            return dict(validated=False, fields=fields, issues=issues)
        values = {}
        for row, (label, value) in enumerate(
            workbook[sheets["brief"]].iter_rows(max_col=2, values_only=True), 1
        ):
            label = str(label or "").strip()
            if not label or label.casefold() == "field":
                continue
            key = label.casefold()
            if key in values:
                issue(f"Brief!A{row}", f"Duplicate field: {label}.")
                continue
            values[key] = (value, f"Brief!B{row}")
            if value is not None:
                fields[label] = value.isoformat() if isinstance(value, (date, datetime)) else value

        def required(label, *aliases):
            for name in (label, *aliases):
                if name.casefold() in values:
                    value, location = values[name.casefold()]
                    if value is not None and str(value).strip():
                        return value, location
                    issue(location, f"Enter {label.lower()}.")
                    return None, location
            issue("Brief", f"Add a field for {label.lower()}.")
            return None, "Brief"

        client, location = required("Client", "Client name")
        if client is not None and str(client).strip().casefold() != client_name.casefold():
            issue(location, f"Client must match {client_name}.")
        channel, location = required("Channel")
        if channel is not None and str(channel).strip().casefold() != "linkedin":
            issue(location, "Channel must be LinkedIn.")
        required("Primary objective", "Objective")
        required("Target audience", "Audience")
        required("CTA priorities", "CTA priority", "Primary CTA", "CTA")

        start_value, start_location = required("Period start", "Period start date", "Start date")
        end_value, end_location = required("Period end", "Period end date", "End date")
        start = as_date(start_value) if start_value is not None else None
        end = as_date(end_value) if end_value is not None else None
        if start_value is not None and start is None:
            issue(start_location, "Use an Excel date or YYYY-MM-DD.")
        if end_value is not None and end is None:
            issue(end_location, "Use an Excel date or YYYY-MM-DD.")
        if start and end and not 0 < (end - start).days <= 92:
            issue(end_location, "End date must follow start date within 92 days.")

        posts, location = required("Number of posts", "Post count", "Posts requested")
        post_count = None
        if posts is not None:
            try:
                count = float(posts)
                if not isinstance(posts, bool) and 1 <= count <= 40 and count.is_integer():
                    post_count = int(count)
            except (TypeError, ValueError):
                pass
            if post_count is None:
                issue(location, "Enter a whole number from 1 to 40.")

        if "key dates" not in sheets:
            issue("Workbook", "Add the Key dates sheet, even if there are no dates to list.")

        return dict(
            validated=not any(item["severity"] == "Error" for item in issues),
            fields=fields,
            issues=issues,
            period=f"{start} to {end}" if start and end else None,
            postCount=post_count,
        )
    finally:
        workbook.close()


if __name__ == "__main__":
    try:
        result = validate(sys.stdin.buffer.read(MAX_UPLOAD + 1), sys.argv[1])
    except Exception:
        result = dict(validated=False, fields={}, issues=[
            dict(severity="Error", location="Workbook", message="Could not read this Excel workbook. Save it as a valid .xlsx and try again.")
        ])
    print(json.dumps(result))
