/**
 * Application Health Example
 * For GDEN Bolierplate
 *
 * @developer       Elijah Rastorguev
 * @version         1.0.0
 * @author          Neurosell
 * @url             https://heath.nsell.tech/
 * @git             https://github.com/Neurosell/gden_boilerplate/
 */
const express = require("express");
const app = express();
const port = process.env.PORT || 8080;

app.use("/", function(req, res) {
   return res.status(200).json({
       success: true,
       message: "Neurosell Health Server is Running",
       data: {}
   })
});
app.listen(port, function() {
    console.log("Server running on port " + port);
});