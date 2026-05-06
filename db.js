// IndexedDB and localStorage helpers for Meal Plan Tracker
// Modularized DB logic

export const DB_NAME = "MealPlanDB";
export const DB_VERSION = 2;
export let db = null;

export function openDB() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = (e) => {
			const d = e.target.result;
			       if (!d.objectStoreNames.contains("days")) {
				       d.createObjectStore("days", { keyPath: "date" });
			       }
			       if (!d.objectStoreNames.contains("weeks")) {
				       d.createObjectStore("weeks", { keyPath: "weekStart" });
			       }
			       if (!d.objectStoreNames.contains("coreitems")) {
				       d.createObjectStore("coreitems", { keyPath: "id" });
			       }
		};
		req.onsuccess = (e) => {
			db = e.target.result;
			resolve(db);
		};
		req.onerror = (e) => reject(e);
	});
}

export function dbGet(store, key) {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, "readonly");
		const req = tx.objectStore(store).get(key);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export function dbPut(store, value) {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, "readwrite");
		const req = tx.objectStore(store).put(value);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

export function dbDelete(store, key) {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, "readwrite");
		const req = tx.objectStore(store).delete(key);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

export function dbGetAll(store) {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, "readonly");
		const req = tx.objectStore(store).getAll();
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

// LocalStorage helpers
export const LS_TODAY = "mp_today_v3";
export const LS_WEEK = "mp_weekstart_v3";

export function loadTodayLS(todayStr) {
	try {
		const raw = localStorage.getItem(LS_TODAY);
		if (!raw) return null;
		const obj = JSON.parse(raw);
		if (obj.date !== todayStr) return null;
		return obj;
	} catch (e) {
		return null;
	}
}

export function saveTodayLS(todayStr, servings, customItems) {
	localStorage.setItem(
		LS_TODAY,
		JSON.stringify({ date: todayStr, servings, customItems }),
	);
}

export function loadWeekStart(todayStr, weekStartFor) {
	let s = localStorage.getItem(LS_WEEK);
	if (!s) {
		s = weekStartFor(todayStr);
		localStorage.setItem(LS_WEEK, s);
	}
	return s;
}
