import { Client } from "../classes"

export const PluginsHandler: Object | any = (necessary: string, props: Client['props']) => {
  const plugins = props.plugins?.find(x => x?.necessary == necessary)
  return plugins
}
