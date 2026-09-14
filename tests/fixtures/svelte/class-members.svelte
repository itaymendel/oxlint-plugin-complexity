<script lang="ts">
// @complexity field:cyclomatic=2,cognitive=0 mode:cyclomatic=2,cognitive=1 nested:cyclomatic=3,cognitive=0 anonymous_4:cyclomatic=2,cognitive=1 method:cyclomatic=3,cognitive=0
declare const isProd: boolean;
declare function readEnv(): string | undefined;

class Store {
  // Field initializers and static blocks are their own units inside SFCs too
  field = readEnv() || "dev";
  mode = isProd ? "a" : "b";
  nested = globalThis.cfg?.deep?.value;

  static {
    if (isProd) {
      Store.ready = true;
    }
  }

  method(p = 1) {
    return p?.x;
  }
}

const store = new Store();
</script>

<p>{store.mode}</p>
