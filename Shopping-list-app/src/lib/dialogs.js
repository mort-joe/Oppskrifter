// Single place for the blocking browser dialogs the app uses, so they can be
// replaced or mocked without touching the call sites.
export const notifyError = (message) => {
  window.alert(message)
}

export const confirmAction = (message) => window.confirm(message)
