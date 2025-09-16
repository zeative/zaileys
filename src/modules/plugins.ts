import { Client } from "../classes";

export const PluginsHandler: (necessary: string, props: Client["props"]) => unknown = (necessary: string, props: Client["props"]) => {
  const plugins = props.plugins?.find(x => x?.necessary == necessary);
  return plugins;
};
