export const compareValue = (arr1: any[], arr2: any[]) => {
  const set1 = new Set(arr1);
  for (let item of arr2) {
    if (set1.has(item)) {
      return true;
    }
  }
  return false;
};

export const removeKeys = (obj, keys) => {
  if (Array.isArray(obj)) return obj.map((item) => removeKeys(item, keys));
  if (obj && typeof obj === "object") {
    return Object.keys(obj).reduce((acc, key) => {
      if (!keys.includes(key)) acc[key] = removeKeys(obj[key], keys);
      return acc;
    }, {});
  }
  return obj;
};
