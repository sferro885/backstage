/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Config, readDurationFromConfig } from '@backstage/config';
import { HumanDuration } from '@backstage/types';
import { LoggerService } from '@backstage/backend-plugin-api';

/**
 * Configuration for the stitching process, controlling polling and timeout
 * behavior for the deferred stitching worker.
 */
export type StitchingStrategy = {
  pollingInterval: HumanDuration;
  stitchTimeout: HumanDuration;
};

export function stitchingStrategyFromConfig(
  config: Config,
  options?: { logger?: LoggerService },
): StitchingStrategy {
  const strategyMode = config.getOptionalString(
    'catalog.stitchingStrategy.mode',
  );

  if (strategyMode === 'immediate') {
    options?.logger?.warn(
      "The 'immediate' stitching strategy mode has been removed and is no longer supported. Falling back to deferred stitching. Please remove the 'catalog.stitchingStrategy.mode' configuration key.",
    );
  }

  const pollingIntervalKey = 'catalog.stitchingStrategy.pollingInterval';
  const stitchTimeoutKey = 'catalog.stitchingStrategy.stitchTimeout';

  const pollingInterval = config.has(pollingIntervalKey)
    ? readDurationFromConfig(config, { key: pollingIntervalKey })
    : { seconds: 1 };
  const stitchTimeout = config.has(stitchTimeoutKey)
    ? readDurationFromConfig(config, { key: stitchTimeoutKey })
    : { seconds: 60 };

  return {
    pollingInterval: pollingInterval,
    stitchTimeout: stitchTimeout,
  };
}
