import { Client } from "../classes";
import { JsonDB, JsonDBInterface } from "../plugins";
import { AuthHandler } from "./auth";
import { PluginsHandler } from "./plugins";

export const CredsHandler = async (props: Client["props"]) => {
  const db = PluginsHandler("database", props) || new JsonDB();
  await (db as JsonDBInterface).initialize(props.session || "default");
  return await AuthHandler(db as JsonDBInterface);
};

export const DatabaseHandler = async (props: Client["props"]) => {
  const db = PluginsHandler("database", props) || new JsonDB();
  await (db as JsonDBInterface).initialize(props.session || "default");
  return db as JsonDBInterface;
};
