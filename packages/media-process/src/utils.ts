export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};

export const ignoreLint = (anyObj: any) => anyObj as any;
