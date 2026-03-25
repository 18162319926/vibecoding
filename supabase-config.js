window.__KNIT_SUPABASE_CONFIG__ = {
  // 替换为你的 Supabase 项目地址，例如: https://xxxx.supabase.co
  supabaseUrl: "https://jgplerdvgcvincshgxbi.supabase.co",
  // 替换为你的 Supabase anon public key
  supabaseAnonKey: "sb_publishable_nHvNGtfP6OH7_DDWUn9xDQ_P2h6W3LL",
  // 本地网络环境下建议关闭 Realtime，改用轮询以避免 WebSocket 反复报错
  realtimeEnabled: false,
  // 轮询间隔（毫秒）
  pollIntervalMs: 10000,
  stateTable: "knit_user_state",
  // 封面图存储桶（建议创建为 public）
  coversBucket: "knit-covers",
};
