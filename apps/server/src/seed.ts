import { Store } from "./store";
import { seedDemo } from "./demo";
const store = new Store(process.env.DATABASE_PATH ?? ".data/opentesoro.sqlite");
seedDemo(store);
console.log("Synthetic demo initialized (existing data preserved).");
store.close();
