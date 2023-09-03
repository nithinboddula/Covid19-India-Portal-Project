const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const convertingToCamelCase = (snake_case_array) => {
  const camelCaseArray = snake_case_array.map((eachObj) => {
    const camelCaseObj = {
      stateId: eachObj.state_id,
      stateName: eachObj.state_name,
      population: eachObj.population,
    };
    return camelCaseObj;
  });

  return camelCaseArray;
};

// Authentication token Middle ware function

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//login API 1
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userDetailsQuery = `
  SELECT
    *
   FROM 
    user
   WHERE
    username = "${username}" ;`;

  const dbUser = await db.get(userDetailsQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// GET all states in camelCase API 2

app.get("/states/", authenticateToken, async (request, response) => {
  const getAllStatesArrayQuery = `SELECT *
    FROM
        state; `;

  const statesArraySnakeCase = await db.all(getAllStatesArrayQuery);
  const camelCaseResultArray = convertingToCamelCase(statesArraySnakeCase);
  response.send(camelCaseResultArray);
});

// GET all states based on state_id in camelCase API 3

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getAllStatesArrayQuery = `SELECT *
    FROM
        state
    WHERE
        state_id = ${stateId}; `;

  const statesObjectSnakeCase = await db.get(getAllStatesArrayQuery);
  const camelCaseResultObj = {
    stateId: statesObjectSnakeCase.state_id,
    stateName: statesObjectSnakeCase.state_name,
    population: statesObjectSnakeCase.population,
  };
  response.send(camelCaseResultObj);
});

//Create a district in the district table API 4
app.post("/districts/", authenticateToken, async (request, response) => {
  const districtColumns = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtColumns;
  const createDistrictDetailsQuery = `
        INSERT INTO
          district (district_name, state_id, cases, cured, active, deaths )
        VALUES ('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths}); `;

  await db.run(createDistrictDetailsQuery);
  response.send("District Successfully Added");
});

// GET a district based on the district ID API 5

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictDetailsQuery = `
    SELECT  *
    FROM
        district
  WHERE
      district_id = ${districtId} ;`;
    const districtObj = await db.get(getDistrictDetailsQuery);
    const resultObj = {
      districtId: districtObj.district_id,
      districtName: districtObj.district_name,
      stateId: districtObj.state_id,
      cases: districtObj.cases,
      cured: districtObj.cured,
      active: districtObj.active,
      deaths: districtObj.deaths,
    };
    response.send(resultObj);
  }
);

// DELETE row from district API 6

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictDetailsQuery = `
    DELETE FROM
      district
    WHERE
        district_id = ${districtId};
    `;
    await db.run(deleteDistrictDetailsQuery);
    response.send("District Removed");
  }
);

//Updates the details of a specific district based on the district ID API 7
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictDetailsQuery = `
    UPDATE
      district
    SET
        district_name = '${districtName}',
        state_id = ${stateId},
        cases = ${cases},
        cured = ${cured},
        active=${active},
        deaths = ${deaths}
    WHERE
         district_id = ${districtId};
    `;
    await db.run(updateDistrictDetailsQuery);
    response.send("District Details Updated");
  }
);

// GET Returns the statistics state based on state ID camelCase API 8
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatisticsQuery = `
    SELECT
        SUM(cases), SUM(cured), SUM(active), SUM(deaths)
    FROM
        district
    WHERE
        state_id = ${stateId}; `;

    const StateStatisticsObject = await db.get(getStateStatisticsQuery);
    const resultObj = {
      totalCases: StateStatisticsObject["SUM(cases)"],
      totalCured: StateStatisticsObject["SUM(cured)"],
      totalActive: StateStatisticsObject["SUM(active)"],
      totalDeaths: StateStatisticsObject["SUM(deaths)"],
    };

    response.send(resultObj);
  }
);

module.exports = app;
