export type Anjay = {
  text: string;
};

export const anjay = (props: Anjay) => {
  console.log("anjay: ", props.text);
};
