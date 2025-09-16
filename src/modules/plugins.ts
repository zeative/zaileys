import { Client } from "../classes";
import _ from "lodash";

export const PluginsHandler: (necessary: string, props: Client["props"]) => unknown = (necessary: string, props: Client["props"]) => {
  const plugins = _.find(props.plugins, x => x?.necessary == necessary);
  return plugins;
};
