const { exec } = require('child_process');
exec('npm run build', (error, stdout, stderr) => {
  if (error) {
    console.error(stdout);
    console.error(stderr);
    process.exit(1);
  }
  console.log("Build OK");
});
