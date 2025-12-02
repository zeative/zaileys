import { store } from "../Modules/store";

export const autoDisplayBanner = async () => {
  console.log("start");
  store.set("mabar", { anjay: "oke" });
};
