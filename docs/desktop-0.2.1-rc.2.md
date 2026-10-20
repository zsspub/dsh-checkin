# DSH 0.2.1-rc.2 兼容性与桌面安装交接

核查日期：2026-10-20。基线：`7222a82`。本次没有提交、推送或修改应用包、真实 desktop profile。

## 当前结论

插件依赖与生成产物已适配 `0.2.1-rc.2`，`pnpm run check` 的 build、typecheck、lint、28 项测试及 pack dry-run 通过。实际 tarball 在独立目录安装成功，并在应用自带 Node `24.21.0` 下完成 Host 冒烟。**真实 desktop profile 安装、桌面 Host 启动、原生面板、工具列表和语言切换仍待验收**，不能将以下自动化和独立进程结果等同于桌面已生效。

当前执行环境只能写入本工作树和临时目录，不能写入 `/Users/bytedance/.dsh/profiles/desktop`，因此没有尝试修改真实 profile，也没有重启正在使用的桌面应用。后续有权限的节点按下文安装并补充实际 diff 和桌面证据。

## 兼容性矩阵

| 项目 | 原状态与证据 | 修复及验证结论 |
| --- | --- | --- |
| DSH 版本契约 | 全部直接 DSH peer/dev 为 `0.1.7-rc.2`，与实际 `0.2.1-rc.2` 不匹配 | 原声明不兼容；统一到目标精确版本，重建 lockfile，无旧版 DSH 混装 |
| Cordis / Schemastery | 原开发 Cordis `4.0.4`、Schemastery `3.18.4`；应用包分别为 `4.0.5`、`3.18.5` | 对齐运行时版本；Config、Service、effect、插件释放及工具用例通过 |
| dsh-invariants 开发依赖 | 尝试解析目标版报 `ERR_PNPM_NO_MATCHING_VERSION`；缓存发布元数据中没有 `0.2.1-rc.2`，代码/测试也没有引用 | 移除该闲置开发依赖；没有删除任何规则、断言或测试 |
| tools / schema / session | 使用 `defineTool`、工具注册/释放、`ToolRunContext.signal`、参数与结果 schema、presentCall | 所用接口兼容；类型检查、六工具回放和打包后实际执行通过，未改变工具名或参数 |
| Typert / Remote | 目标生成器新增 `createTypertRemoteInfo` 和普通/严格输入描述；旧 `lib/` 是旧生成器产物 | 必须重新生成；Host、Remote Client 与客户端 bundle 已更新。保留缺失 `create()` 工厂的失败断言，并新增空 invocation/空 codec 失败断言；九个 Remote 的普通/严格输入和结果工厂回归通过 |
| brand / api-remotes | `TopicId` 使用 `Branded`，客户端 `$mount` 后消费 `remote.checkin` | 类型及生成命名空间兼容；打包后九个描述符可加载。真实桌面连接/挂载待验收 |
| slots / sidebar / sidebar-right | 使用 footer action、Tab definition、`openTab`、`useTabInfo`、visible/signal | 所用签名兼容；11 项面板测试与请求生命周期测试通过。保持既有会话宿主边界，未扩展无会话全局面板 |
| primitives / renderer | Button、Menu、Modal 是宿主共享模块；没有独立 Host 包目录不代表缺失 | 应用 `dsh-web-frontend/dist/assets/index-CN7NIWNw.js` 的 `SZ()` 内置表提供 primitives、slots、React；primitives 导出表包含 Button/Menu/Modal。目标声明与构建通过，保持 externals/inject 不变；实际原生渲染待验收 |
| locale | `locale.register/bind`、中英文词典及 locale slot props | 目标声明和客户端构建兼容；UI 回归使用中文文案通过，桌面中英文切换待验收 |
| SQLite / store / JSON 备份 | 默认共享库为 schema v2；当前 4 个主题、407 条记录，WAL 为空，完整性 `ok` | 无 schema/业务改动。Node `24.21.0` 下新库 CRUD、备份幂等导入和重开持久化通过；既有库只读快照可导出 v2 并重复导入，数据不变 |
| pnpm / 构建运行时 | 项目原 pin `11.7.0` 会触发 pnpm 自动切换 | packageManager 对齐应用 `11.28.5`。应用 Node `24.21.0` 加载 Rolldown native binding 报不同 Team IDs；不修改应用签名，构建采用本机 Node `24.22.0`，打包 Host 另用原应用 Node 验证 |

应用版本来自 `/Applications/DeepSeek Harness.app/Contents/Info.plist`；Node/pnpm 来自 `Contents/Resources/runtime/versions.json` 及实际 `--version`。包版本、导出与内置客户端模块只读核对自 `app.asar`；声明核对使用对应目标版本安装包。

## 本次验证与复现

- `pnpm run check`：5 个测试文件、28 项测试；原 26 项保留，新增 2 项生成 Remote 回归。没有改变 ESLint、TS、Vitest 配置及原 check 链。
- `pnpm pack --pack-destination artifacts`：产物 `artifacts/dsh-checkin-0.1.0.tgz`，包含 Host/tools/client、生成 Remote、类型、patch 和本文档。版本号仍为 `0.1.0`，安装时用 SHA-256 区分产物。
- 独立 tarball 安装后运行 `scripts/verify-package.mjs <安装目录>`：六工具可注册/执行/释放，九 Remote codec 可创建，SQLite schema v2、完整性、重开持久化、JSON v2 备份及幂等导入通过。该脚本只操作临时数据库，不访问真实共享库。
- 既有库核查：WAL 确认为空后以 SQLite `mode=ro&immutable=1` 读取主库并备份到忽略目录；新实现只操作该副本。4 个主题、407 条记录的导出前后语义一致。WAL 非空时不能采用这个快照方法，应使用下节在线备份。
- 原始本机日志保留在忽略的 `.verification/check.log`、`.verification/pack.log`、`.verification/install.log`；不提交数据库、缓存或原始用户配置。

本机命令（在仓库根目录，Node `24.22.0` 用于开发构建，pnpm 使用应用自带版本）：

```sh
RUNTIME='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies'
mkdir -p .verification/bin
cat > .verification/bin/pnpm <<'SH'
#!/bin/sh
exec '/Users/bytedance/.nvm/versions/node/v24.22.0/bin/node' '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs' "$@"
SH
chmod +x .verification/bin/pnpm
export PATH="$PWD/.verification/bin:/Users/bytedance/.nvm/versions/node/v24.22.0/bin:$PATH"
export XDG_CACHE_HOME="$PWD/node_modules/.cache"
pnpm install --frozen-lockfile
pnpm run check
pnpm pack --pack-destination artifacts
shasum -a 256 artifacts/dsh-checkin-0.1.0.tgz

mkdir -p .verification/install
cat > .verification/install/package.json <<'JSON'
{"private":true,"type":"module","packageManager":"pnpm@11.28.5","dependencies":{"dsh-checkin":"file:../../artifacts/dsh-checkin-0.1.0.tgz"}}
JSON
pnpm --dir .verification/install install
"$RUNTIME/node/bin/node" scripts/verify-package.mjs .verification/install
```

本环境网络 fetch 失败，实际安装以本机缓存的副本执行 `--offline --registry=https://bnpm.byted.org --store-dir "$PWD/node_modules/.cache/pnpm-store"`；锁文件由 pnpm 正常解析生成，供应链策略校验通过，包完整性未手写，仓库 `.npmrc` 仍指向官方 npm。缓存目录放在 `node_modules/.cache`，不修改 lint 忽略范围。

## 真实 desktop 安装前的现状与备份

核查时 desktop 的 package.json、pnpm-lock.yaml、patch、node_modules 和插件管理日志均无 check-in 项；**当前未安装**，没有发现该 profile 的半安装证据。Web profile 仍链接原仓库，默认共享库及历史备份确实存在，应保留，不能当作无用残留删除。

现有五个插件版本：Honey `0.6.2`，Codex Bridge `0.1.16`，TraeX Bridge `0.1.16`，fund-portfolio `0.1.0`，personal-todo `0.1.0`。安装前重新记录声明、所有已解析依赖和源文件位置，不能仅凭这些版本号比较。桌面端与 Web profile 共用 `$DSH_HOME/checkin/checkin.sqlite3`，不要关闭其他 profile 或清空数据库。

以下命令**尚未执行**，须在允许写真实 profile 的环境运行。先正常完全退出桌面端，确认其 Host 已退出，再执行：

```sh
PROFILE='/Users/bytedance/.dsh/profiles/desktop'
RUNTIME='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies'
BACKUP="$PROFILE/.plugin-manager/backups/checkin-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
for file in package.json pnpm-lock.yaml pnpm-workspace.yaml cordis.yml cordis.patch.yml; do
  cp -p "$PROFILE/$file" "$BACKUP/$file"
done
"$RUNTIME/node/bin/node" "$RUNTIME/pnpm/bin/pnpm.cjs" --dir "$PROFILE" list --depth Infinity --json > "$BACKUP/dependencies-before.json"
python3 - "$BACKUP" <<'PY'
import sqlite3, sys
from pathlib import Path
source = Path('/Users/bytedance/.dsh/checkin/checkin.sqlite3')
if source.exists():
    src = sqlite3.connect(f'file:{source}?mode=ro', uri=True)
    dst = sqlite3.connect(str(Path(sys.argv[1]) / 'checkin.sqlite3'))
    src.backup(dst)
    assert dst.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    dst.close()
    src.close()
PY
```

保留上述备份目录和现有依赖产物，以便回滚。在线 SQLite backup 包含已提交 WAL 数据，不直接复制活跃主库。

## 安装、配置 diff 与回滚

将本次 tgz 固定到 profile 内，以免依赖后续可能移除的工作树：

```sh
SOURCE_TGZ="$PWD/artifacts/dsh-checkin-0.1.0.tgz"
DIGEST=$(shasum -a 256 "$SOURCE_TGZ" | cut -d ' ' -f 1)
DEST="$PROFILE/.plugin-manager/artifacts/dsh-checkin/$DIGEST"
mkdir -p "$DEST"
cp -p "$SOURCE_TGZ" "$DEST/dsh-checkin-0.1.0.tgz"
cmp "$SOURCE_TGZ" "$DEST/dsh-checkin-0.1.0.tgz"
DSH_HOME=/Users/bytedance/.dsh DSH_PROFILE=desktop \
  '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' \
  plugin --profile desktop add "$DEST/dsh-checkin-0.1.0.tgz"
diff -u "$BACKUP/package.json" "$PROFILE/package.json"
diff -u "$BACKUP/pnpm-lock.yaml" "$PROFILE/pnpm-lock.yaml"
```

该 CLI 使用应用管理的 pnpm。预期 package.json 只在 bundles 末尾增加一次 `dsh-checkin`，dependencies 增加 `"dsh-checkin": "file:<DEST>/dsh-checkin-0.1.0.tgz"`；原 bundle 顺序和全部既有依赖声明不变。这是**预期 diff，不是已安装结果**。lockfile 应增加 check-in importer 依赖、tarball 校验与必要解析；逐项比较原有插件及其解析版本，不允许无关升级。插件自带 patch 提供 `checkin` 和 `checkin-tools`，默认无需修改 profile patch。

安装后记录实际 package.json/lockfile diff、完整依赖树、tgz SHA-256 和安装目录关键文件校验。若出现既有依赖版本变化、缺失产物或安装失败，先恢复备份配置与原依赖状态，再分析重试。保留失败退出码与脱敏日志，不通过兼容豁免掩盖问题。

回滚时完全退出桌面端，将备份的五个配置文件恢复原位，再用应用自带 pnpm 根据原 lockfile 执行 frozen install，确认原插件版本和文件来源恢复。依赖不可获取时使用安装前保留的来源产物恢复；确认恢复成功后再启动。默认保留 SQLite 当前数据，不用旧数据库覆盖安装后可能新增的记录；数据库备份仅用于确有数据损坏且已处理后续写入的恢复。

## 桌面待验收清单

- 重启真实应用，确认 desktop profile；Host 和 client bundle 正常加载，日志/控制台无 check-in、Remote、codec 错误。
- 已挂载会话中打开右侧日历，检查月份、筛选、关闭重开、隐藏恢复、拆分 Pane 独立状态。
- 实际工具列表中出现 `checkin_topic_create/list/update/delete`、`checkin_set`、`checkin_query`；通过真实调用和面板交叉验证临时主题、打卡、补签、查询、撤销及删除。
- 保留一条临时记录跨桌面重启验证持久化，再仅按精确 ID 清理测试主题；既有数据不被覆盖，完整性与外键检查通过。
- 在原生面板导出真实 JSON 文件，经预览确认导入同一备份，重复导入幂等；中英文文案、确认框及错误反馈无缺失 key，恢复原语言设置。
- 记录原生界面截图/日志及实际配置 diff。任何未完成项保留“待验收”，不以独立 Host、JSDOM 或 Web 测试替代。
