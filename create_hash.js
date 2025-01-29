const bcrypt = require("bcrypt");
(async () => {
  const hash = await bcrypt.hash("b+E15k9~16>m", 10);
  console.log(hash);
})();