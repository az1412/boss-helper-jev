import type { Adapter, SendMessage, OnMessage, Message } from 'comctx'

declare global {
  function cloneInto<T>(value: T, target: any): T
}

export class ProvideContentAdapter implements Adapter {
  sendMessage: SendMessage = (message) => {
    /**
     * Compatible with Firefox
     * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts#cloneinto
     */
    const detail =
      typeof cloneInto === 'function' ? cloneInto(message, document.defaultView) : message

    document.dispatchEvent(new CustomEvent('_boss-helper-message_', { detail }))
  }
  onMessage: OnMessage = (callback) => {
    const handler = (event: Event) => {
      callback((event as CustomEvent<Partial<Message> | undefined>).detail)
    }
    document.addEventListener('_boss-helper-message_', handler)
    return () => document.removeEventListener('_boss-helper-message_', handler)
  }
}

// export class ProvideContentScriptAdapter implements Adapter {
//   script: HTMLScriptElement;

//   constructor(script: HTMLScriptElement) {
//     this.script = script;
//   }
//   sendMessage: SendMessage = (message) => {
//     // /**
//     //  * Compatible with Firefox
//     //  * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts#cloneinto
//     //  */
//     const detail =
//       typeof cloneInto === "function" ? cloneInto(message, document.defaultView) : message;
//     this.script.dispatchEvent(new CustomEvent("_boss-helper-message_", { detail }));
//   };

//   onMessage: OnMessage = (callback) => {
//     const handler = (event: Event) => {
//       callback((event as CustomEvent<Partial<Message> | undefined>).detail);
//     };
//     this.script.addEventListener("_boss-helper-message_", handler);
//     return () => this.script.removeEventListener("_boss-helper-message_", handler);
//   };
// }

export class ProvideContentScriptAdapter implements Adapter {
  script: HTMLScriptElement

  constructor(script: HTMLScriptElement) {
    this.script = script
  }
  sendMessage: SendMessage = (message) => {
    this.script.dispatchEvent(
      new CustomEvent('_boss-helper-message_', { detail: JSON.stringify(message) }),
    )
  }

  onMessage: OnMessage = (callback) => {
    const handler = (event: Event) => {
      callback(JSON.parse((event as CustomEvent<string>).detail))
    }
    this.script.addEventListener('_boss-helper-message_', handler)
    return () => this.script.removeEventListener('_boss-helper-message_', handler)
  }
}
