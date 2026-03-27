const { spawn } = require("child_process");

const children = [];
let shuttingDown = false;

function startProcess(label, file) {
  const child = spawn(process.execPath, [file], {
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      shuttingDown = true;
      shutdown(signal ? 0 : code ?? 1);
    }
  });

  child.on("error", (error) => {
    console.error(`${label} failed: ${error.message}`);
    if (!shuttingDown) {
      shuttingDown = true;
      shutdown(1);
    }
  });

  children.push(child);
}

function shutdown(exitCode = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(exitCode), 100);
}

process.on("SIGINT", () => {
  if (!shuttingDown) {
    shuttingDown = true;
    shutdown(0);
  }
});

process.on("SIGTERM", () => {
  if (!shuttingDown) {
    shuttingDown = true;
    shutdown(0);
  }
});

startProcess("backend", "server.js");
startProcess("frontend", "frontend-server.js");
