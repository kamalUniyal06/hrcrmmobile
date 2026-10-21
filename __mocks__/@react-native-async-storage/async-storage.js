// In-memory AsyncStorage used by Jest (auto-applied by Jest's root __mocks__ convention).
const store = new Map();

const AsyncStorage = {
  getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
  setItem: jest.fn(async (key, value) => {
    store.set(key, String(value));
  }),
  removeItem: jest.fn(async (key) => {
    store.delete(key);
  }),
  clear: jest.fn(async () => {
    store.clear();
  }),
  getAllKeys: jest.fn(async () => [...store.keys()]),
  multiGet: jest.fn(async (keys) => keys.map((key) => [key, store.has(key) ? store.get(key) : null])),
  multiSet: jest.fn(async (pairs) => {
    for (const [key, value] of pairs) store.set(key, String(value));
  }),
  multiRemove: jest.fn(async (keys) => {
    for (const key of keys) store.delete(key);
  }),
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
