// @complexity ShortCircuitRender:cyclomatic=2,cognitive=0
function ShortCircuitRender({ show, items }) {
  return <div>{show && <span>Visible</span>}</div>;
}
