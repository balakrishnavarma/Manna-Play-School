const app = require('./api/index');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`Manna Play School Server is running on Port ${PORT}`);
  console.log(`Local Access: http://localhost:${PORT}`);
  console.log(`=================================================`);
});
