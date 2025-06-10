import { useState, useEffect } from "react";
import { openDB, IDBPDatabase } from "idb";
import { dbName, storeName } from "../consts";

export function useIndexedDB() {
  const [db, setDb] = useState<IDBPDatabase | null>(null);

  useEffect(() => {
    const initDb = async () => {
      const db = await openDB(dbName, 1, {
        upgrade(db) {
          db.createObjectStore(storeName, {
            keyPath: "id",
            autoIncrement: true,
          });
        },
      });
      setDb(db);
    };
    initDb();
  }, []);

  return db;
}
