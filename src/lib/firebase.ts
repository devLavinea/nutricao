import { initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(
    `Configuração do Firebase incompleta. Verifique o arquivo .env. Faltando: ${missing.join(", ")}`
  );
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

type QueryState = {
  collectionName: string;
  selectedFields?: string[];
  orders: { field: string; ascending: boolean }[];
  limitCount?: number;
};

function pickFields(data: Record<string, any>, fields?: string[]) {
  if (!fields || fields.length === 0) return data;
  const result: Record<string, any> = {};
  for (const field of fields) {
    if (field in data) result[field] = data[field];
  }
  return result;
}

function compareValues(a: any, b: any) {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

function formatFirebaseError(error: any) {
  return {
    code: error?.code ?? "firebase/error",
    message: error?.message ?? String(error),
    details: error?.details ?? "",
    hint: error?.hint ?? "",
  };
}

async function executeSelect(state: QueryState) {
  const ref = collection(db, state.collectionName);
  const firestoreQuery =
    state.orders.length === 1
      ? query(
          ref,
          orderBy(
            state.orders[0].field,
            state.orders[0].ascending ? "asc" : "desc"
          )
        )
      : ref;

  const snapshot = await getDocs(firestoreQuery);

  let rows: Record<string, any>[] = snapshot.docs.map((item) => {
    const data = item.data();
    return { id: data.id ?? item.id, ...data, _firestoreId: item.id };
  });

  if (state.orders.length > 1) {
    rows.sort((a, b) => {
      for (const order of state.orders) {
        const comparison = compareValues(a[order.field], b[order.field]);
        if (comparison !== 0) {
          return order.ascending ? comparison : -comparison;
        }
      }
      return 0;
    });
  }

  if (typeof state.limitCount === "number") {
    rows = rows.slice(0, Math.max(0, state.limitCount));
  }

  return rows.map((row) => pickFields(row, state.selectedFields));
}

class SelectBuilder {
  private readonly state: QueryState;

  constructor(collectionName: string, fields?: string) {
    this.state = {
      collectionName,
      selectedFields: fields
        ? fields.split(",").map((field) => field.trim()).filter(Boolean)
        : undefined,
      orders: [],
    };
  }

  order(field: string, options?: { ascending?: boolean }): this {
    this.state.orders.push({
      field,
      ascending: options?.ascending ?? true,
    });
    return this;
  }

  limit(count: number): this {
    this.state.limitCount = count;
    return this;
  }

  then<TResult1 = { data: any[] | null; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any[] | null; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return executeSelect(this.state)
      .then((data) => ({ data, error: null }))
      .catch((error) => ({ data: null, error: formatFirebaseError(error) }))
      .then(onfulfilled as any, onrejected as any);
  }
}

class InsertBuilder {
  private readonly collectionName: string;
  private readonly payload: Record<string, any> | Record<string, any>[];

  constructor(
    collectionName: string,
    payload: Record<string, any> | Record<string, any>[]
  ) {
    this.collectionName = collectionName;
    this.payload = payload;
  }

  async select(_fields?: string) {
    try {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      const saved: Record<string, any>[] = [];

      for (let index = 0; index < items.length; index++) {
        const item = { ...items[index] };
        if (item.id == null) item.id = Date.now() + index;

        const ref = await addDoc(collection(db, this.collectionName), item);
        saved.push({ ...item, _firestoreId: ref.id });
      }

      return { data: saved, error: null };
    } catch (error) {
      return { data: null, error: formatFirebaseError(error) };
    }
  }

  async single() {
    const result = await this.select();
    return { data: result.data?.[0] ?? null, error: result.error };
  }
}

class DeleteBuilder {
  private readonly collectionName: string;
  private ids: any[] | null = null;
  private filters: { field: string; value: any }[] = [];

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  in(field: string, values: any[]): this {
    if (field !== "id") {
      throw new Error(`Exclusão em lote não suportada para o campo "${field}".`);
    }
    this.ids = values;
    return this;
  }

  eq(field: string, value: any): this {
    this.filters.push({ field, value });
    return this;
  }

  async execute() {
    try {
      const snapshot = await getDocs(collection(db, this.collectionName));
      const docsToDelete = snapshot.docs.filter((item) => {
        const data = item.data();
        const documentId = String(item.id);
        const storedId = data.id == null ? "" : String(data.id);
        const matchesIds =
          !this.ids ||
          this.ids.some((id) => {
            const targetId = String(id);
            return targetId === documentId || targetId === storedId;
          });
        const matchesFilters = this.filters.every(
          ({ field, value }) => String(data[field] ?? "") === String(value ?? "")
        );
        return matchesIds && matchesFilters;
      });

      await Promise.all(docsToDelete.map((item) => deleteDoc(item.ref)));

      if (this.ids && docsToDelete.length === 0) {
        return {
          data: null,
          error: {
            code: "firebase/not-found",
            message: "Nenhum registro correspondente foi encontrado para exclusão.",
          },
        };
      }

      return { data: docsToDelete.map((item) => item.id), error: null };
    } catch (error) {
      return { data: null, error: formatFirebaseError(error) };
    }
  }

  then<TResult1 = { data: string[] | null; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: string[] | null; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }
}

class FirebaseDatabaseAdapter {
  from(collectionName: string) {
    return {
      select: (fields?: string) => new SelectBuilder(collectionName, fields),
      insert: (payload: Record<string, any> | Record<string, any>[]) =>
        new InsertBuilder(collectionName, payload),
      delete: () => new DeleteBuilder(collectionName),
    };
  }
}

export const firebaseDb = new FirebaseDatabaseAdapter();