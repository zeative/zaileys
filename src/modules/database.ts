import { Client } from "../classes";
import { JsonDB } from "../plugins";
import { AuthHandler } from "./auth";
import { PluginsHandler } from "./plugins";

export const CredsHandler = async (props: Client['props']) => {
  const db = PluginsHandler('database', props) || new JsonDB()
  await db.initialize(props.session)
  return await AuthHandler(db)
}

export const DatabaseHandler = async (props: Client['props']) => {
  const db = PluginsHandler('database', props) || new JsonDB()
  await db.initialize(props.session)
  return db
}
