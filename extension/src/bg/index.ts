import { Connection, ContextMenuId, InvokerFunc } from "@/types"
import { session } from "./session"
import { msgInvoker } from "@/utils/invoker"
import { contentMainScript, contentScript } from "@/manifest"
import { EMPTY, finalize, interval, switchMap, tap } from "rxjs"
import { formatDuration } from "@/utils/util"
import { runCrawlTask, getTaskExecutionByName } from "./tools"

const __DEV__ = process.env.NODE_ENV == "development"

// Suppress "Could not establish connection" — fires when messaging tabs without content scripts
self.addEventListener("unhandledrejection", (e) => {
  if (e.reason?.message?.includes?.("Could not establish connection")) {
    e.preventDefault()
  }
})

chrome.scripting.unregisterContentScripts({ ids: [contentScript.id, contentMainScript.id] }).then(() => {
  chrome.scripting.registerContentScripts([contentScript, contentMainScript])
}).catch(() => {
  chrome.scripting.registerContentScripts([contentScript, contentMainScript])
})
chrome.runtime.onMessage.addListener(handleMessage)
chrome.runtime.onInstalled.addListener(handleInstalled)
chrome.contextMenus.onClicked.addListener(handleContextMenusClicked)
chrome.action.onClicked.addListener(handleActionClicked)
chrome.action.setBadgeText({ text: "" })

msgInvoker
  .add(InvokerFunc.Connect, session.connect)
  .add(InvokerFunc.Disconnect, session.disconnect)
  .add(InvokerFunc.GetConnectionState, () => {
    msgInvoker.invoke({
      tabId: msgInvoker.currentSender?.tab?.id,
      func: InvokerFunc.ConnectionState,
      args: [session.getState()],
    }).catch(() => {})
  })

session.connection$
  .pipe(
    tap(() => {
      msgInvoker.invoke({
        func: InvokerFunc.ConnectionState,
        args: [session.getState()],
      }).catch(() => {})
    }),
    switchMap((connection) => {
      if (connection == Connection.Connected) {
        return interval(1000).pipe(
          tap(() => {
            const duration = Date.now() - session.connectedAt
            chrome.action.setBadgeText({
              text: formatDuration(duration),
            })
          }),
          finalize(() => {
            chrome.action.setBadgeText({
              text: "",
            })
          })
        )
      } else {
        return EMPTY
      }
    })
  )
  .subscribe()

function handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
  console.log("[bg]: ", message.type, message)
  switch (message.type) {
    case msgInvoker.invokeMsgType:
      msgInvoker.handleReqMsg(message, sender)
      break
    case msgInvoker.resMsgType:
      msgInvoker.handleResMsg(message)
      break
    case "run_task":
      if (message.async) {
        // Async mode: start task and return taskId immediately
        runCrawlTask(message.taskName, false)
          .then((res) => sendResponse(res))
          .catch((e) => sendResponse({ error: e.message }))
      } else {
        // Sync mode: wait for completion (for MCP tools)
        runCrawlTask(message.taskName, true).then(sendResponse).catch((e) => sendResponse({ error: e.message }))
      }
      return true
    case "task_status": {
      const exec = getTaskExecutionByName(message.taskName)
      if (!exec) { sendResponse(null); break }
      sendResponse({
        taskId: exec.taskId,
        status: exec.status,
        progress: exec.progress,
        error: exec.error,
      })
      break
    }
    case "task_result": {
      const exec2 = getTaskExecutionByName(message.taskName)
      if (!exec2) { sendResponse(null); break }
      sendResponse(exec2.result || { status: exec2.status, error: exec2.error })
      break
    }
  }
}

function handleInstalled({ reason }: chrome.runtime.InstalledDetails) {
  // Remove stale menu items (e.g. the old empty-title one from prior versions)
  chrome.contextMenus.removeAll(() => {
    if (__DEV__) {
      chrome.contextMenus.create({
        contexts: ["action"],
        id: ContextMenuId.Dev,
        title: "DEV",
      })
    }
  })
}

// Register once at top level — NOT inside handleInstalled (avoids duplicate listeners on update)
chrome.tabs.onActivated.addListener(async (info) => {
  const tab = await chrome.tabs.get(info.tabId).catch(() => null)
  if (!tab?.url?.startsWith("http")) return
  msgInvoker
    .invoke({
      tabId: info.tabId,
      func: InvokerFunc.PingContent,
      timeout: 300,
    })
    .catch(() => {
      chrome.scripting.executeScript({
        files: contentScript.js,
        target: { tabId: info.tabId },
      }).catch(() => {})
      chrome.scripting.executeScript({
        files: contentMainScript.js,
        target: { tabId: info.tabId },
        world: "MAIN",
      }).catch(() => {})
    })
})

function handleContextMenusClicked(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
) {
  switch (info.menuItemId) {
    case ContextMenuId.Dev:
      chrome.tabs.create({ url: "/dev.html" })
      break
  }
}

function handleActionClicked(tab: chrome.tabs.Tab) {
  //
}
