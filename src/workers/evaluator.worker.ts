import { assertCompatible, evaluate } from "../learning/evaluate";
import { validateMap } from "../core/maps";
import { validateModel } from "../storage";
self.onmessage = (e) => {
  try {
    const model = validateModel(e.data.model),
      map = validateMap(e.data.map);
    assertCompatible(model, map);
    self.postMessage({
      result: evaluate(
        model.policy,
        map,
        [101, 202, 303],
        model.config.horizon,
      ),
    });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
