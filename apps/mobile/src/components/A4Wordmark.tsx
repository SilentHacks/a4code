import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

export function A4Wordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  return (
    <Svg accessibilityLabel="A4" height={props.height} width={props.height} viewBox="0 0 24 24">
      <ThemedPath
        d="M1 19 5.8 5h3.4L14 19h-3.4l-1-3H5.4l-1 3Zm5.3-6h2.4L7.5 9.2ZM17.8 5H21v8h2v3h-2v3h-3v-3h-6v-3Zm.2 4.4L15.4 13H18Z"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
