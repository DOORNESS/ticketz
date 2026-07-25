const EMPTY_GITINFO = {
  tagName: "",
  branchName: "",
  commitHash: "",
  buildTimestamp: ""
};

let cached = null;

export function getGitinfoSync() {
  return cached || EMPTY_GITINFO;
}

export async function loadGitinfo() {
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch("/gitinfo.json", { cache: "no-store" });
    if (response.ok) {
      cached = await response.json();
      return cached;
    }
  } catch {
    // ignore — gitinfo is optional metadata
  }

  return EMPTY_GITINFO;
}
