import { scenarios, simulate, type Scenario } from "../packages/simulation/scenarios.ts";

const selected = process.argv[2] ?? "normal";
if (!scenarios.includes(selected as Scenario)) {
  console.error("Simulation scenarios: " + scenarios.join(", "));
  process.exitCode = 2;
} else {
  console.log(JSON.stringify(simulate(selected as Scenario), null, 2));
}
