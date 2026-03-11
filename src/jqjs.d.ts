declare module "*/vendor/jqjs.js" {
  function jq(expression: string, input?: unknown): Generator<unknown, void, unknown>;
  export default jq;
}
