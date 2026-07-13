import { test } from "@playwright/test";

const controlledFeedEnabled = process.env.PI_APP_UPDATE_CONTROLLED_FEED === "1";
const hasSignedArtifacts =
  Boolean(process.env.PI_APP_PACKAGED_UPDATE_BASE) && Boolean(process.env.PI_APP_PACKAGED_UPDATE_NEXT);

test("relaunches from a controlled update feed after download", async () => {
  test.skip(
    !controlledFeedEnabled || !hasSignedArtifacts,
    "Set PI_APP_UPDATE_CONTROLLED_FEED=1 plus PI_APP_PACKAGED_UPDATE_BASE and PI_APP_PACKAGED_UPDATE_NEXT to signed macOS N/N+1 artifacts.",
  );

  test.setTimeout(300_000);
  test.fixme(true, "Requires signed macOS N/N+1 artifacts and a controlled update feed fixture.");
});
