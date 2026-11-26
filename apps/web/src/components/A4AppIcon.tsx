import appIconUrl from "../../../../assets/prod/a4-black-web-apple-touch-180.png";

export function A4AppIcon(props: { readonly className?: string }) {
  return <img src={appIconUrl} alt="" className={props.className} />;
}
