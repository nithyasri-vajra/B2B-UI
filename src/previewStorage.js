import { createKnowledgeFileRecord } from "./extractKnowledgeRecords";

export async function restorePreviewStore(store, onError) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("b2b-agents-preview", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Preview storage is blocked."));
  });

  const snapshot = await new Promise((resolve, reject) => {
    const request = db.transaction("state").objectStore("state").get("preview");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (snapshot) {
    const savedRecords = new Map(snapshot.records.map((record) => [record.id, record]));
    const records = new Map();
    const uploads = await Promise.all(snapshot.uploads.map(async (upload) => {
      const record = upload.file && await createKnowledgeFileRecord(upload.file, upload.clientId);
      if (record) records.set(record.id, savedRecords.get(record.id) ?? record);
      return { ...upload, recordCount: record ? 1 : 0 };
    }));
    const runs = snapshot.runs.map((run) => run.draftingResult?.running
      ? { ...run, draftingResult: { error: "Drafting was interrupted. Retry from the run page." } }
      : run);
    store.ingest({ ...snapshot, runs, uploads, records: [...records.values()] });
  }

  store.subscribe(() => {
    try {
      const transaction = db.transaction("state", "readwrite");
      transaction.onabort = onError;
      transaction.objectStore("state").put(store.getSnapshot(), "preview");
    } catch {
      onError();
    }
  });
}
