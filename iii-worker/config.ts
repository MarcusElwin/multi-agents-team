/**
 * Worker-side configuration. Every engine-specific function id, queue, stream,
 * and feature flag is read from the environment with a sensible default, so the
 * exact contracts can be pinned against a live engine without code changes.
 *
 * All four framework integrations (stream / state / queue / policy) default
 * OFF — the verified batch path stays the default until each is confirmed on a
 * real deploy. See README "Adopting iii's prebuilt workers".
 */
const env = (k: string) => process.env[k]?.trim() || undefined;
const flag = (k: string) => process.env[k] === 'true';

export const cfg = {
  engineUrl: env('III_ENGINE_URL') || 'ws://localhost:49134',
  runFn: env('MAT_RUN_FUNCTION_ID') || 'mat::run',
  executeFn: env('MAT_EXECUTE_FUNCTION_ID') || 'mat::execute',
  runPath: (() => {
    const p = env('III_RUN_PATH') || '/run';
    return p.startsWith('/') ? p : `/${p}`;
  })(),
  token: env('III_ENGINE_TOKEN'),

  // iii-queue: enqueue runs so they outlive the HTTP request.
  queueEnabled: flag('III_QUEUE_ENABLED'),
  queueName: env('III_QUEUE_NAME') || 'mat',

  // iii-stream: publish run events live.
  streamEnabled: flag('III_STREAM_ENABLED'),
  // The engine's stream worker registers `stream::send` (append an item);
  // there is no `stream::publish` (that's the pub/sub `publish` fn, which wants
  // a topic, not a stream). Using the wrong id is silently fatal — every publish
  // returns "Function not found" and the stream stays empty.
  streamPublishFn: env('III_STREAM_PUBLISH_FN') || 'stream::send',
  streamNamePrefix: env('III_STREAM_NAME_PREFIX') || 'mat:run:',
  streamGroup: env('III_STREAM_GROUP') || 'events',

  // iii-state: server-side session history.
  stateEnabled: flag('III_STATE_ENABLED'),
  stateGetFn: env('III_STATE_GET_FN') || 'state::get',
  stateSetFn: env('III_STATE_SET_FN') || 'state::set',
  stateScope: env('III_STATE_SCOPE') || 'mat:session',

  // harness policy: gate tools via policy::check_permissions.
  policyEnabled: flag('III_POLICY_ENABLED'),
  policyFn: env('III_POLICY_FN') || 'policy::check_permissions',

  // Channels: hand a large final artifact to a sink worker over a channel,
  // instead of inlining it. The sink id can point at a dedicated render/store
  // worker; with one worker it round-trips to a co-registered ack function.
  artifactChannelEnabled: flag('III_ARTIFACT_CHANNEL_ENABLED'),
  artifactThresholdBytes: Number(env('III_ARTIFACT_THRESHOLD_BYTES')) || 16_384,
  artifactSinkFn: env('MAT_ARTIFACT_FUNCTION_ID') || 'mat::artifact',
} as const;
