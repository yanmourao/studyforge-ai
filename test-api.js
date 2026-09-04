const http = require("http");

function post(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: "localhost",
      port: 3001,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, body: body, headers: res.headers });
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function test() {
  try {
    console.log("Testing signup...");
    const signupResult = await post("/api/signup", {
      name: "Test User",
      email: "test@example.com",
      password: "password123"
    });
    console.log("Signup:", signupResult.statusCode, signupResult.body);

    console.log("\nTesting login...");
    const loginResult = await post("/api/login", {
      email: "test@example.com",
      password: "password123"
    });
    console.log("Login:", loginResult.statusCode, loginResult.body);
  } catch (error) {
    console.error("Error:", error);
  }
}

test();