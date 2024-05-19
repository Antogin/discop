import dotenv from "dotenv";
import { JSDOM } from "jsdom";

dotenv.config();

const githubToken = process.env.GITHUB_TOKEN;
const repoOwner = process.env.REPO_OWNER;
const repoName = process.env.REPO_NAME;

async function getList(listId) {
  const options = {
    method: "GET",
  };

  return fetch(`https://api.discogs.com/lists/${listId}`, options).then(
    (response) => response.json()
  );
}

async function getRelease(releaseId) {
  const options = {
    method: "GET",
  };

  const release = await fetch(
    `https://api.discogs.com/releases/${releaseId}`,
    options
  ).then((response) => response.json());

  const page = await fetch(
    `https://www.discogs.com/sell/release/${releaseId}`,
    options
  ).then((response) => response.text());

  const dom = new JSDOM(page);
  const document = dom.window.document;

  const getLowestPricedItem = (items) => {
    return items.reduce((lowest, item) => {
      return lowest.combinedPrice < item.combinedPrice ? lowest : item;
    });
  };
  const table = document.querySelector(".table_block");

  const rows = table.querySelectorAll("tr");

  const filteredRows = Array.from(rows).filter((row) => {
    const isEuro = !!row.querySelector('span[data-currency="EUR"]');
    const isPounds = !!row.querySelector('span[data-currency="GBP"]');
    if (isEuro || isPounds) {
      return true;
    }
  });

  const listings = filteredRows.map((row) => {
    const seller = row?.querySelector(".seller_block a")?.innerHTML;

    const combinedPrice = Number(
      row
        ?.querySelector(".converted_price")
        ?.innerHTML.replace("<span>total</span>", "")
        ?.replace("<span>about</span>", "")
        ?.replaceAll(" ", "")
        ?.replace("€", "")
        ?.replace("£", "")
    );

    const isMint = row
      .querySelector(".item_condition")
      .innerHTML.includes("Mint");

    const res = {
      combinedPrice,
      isMint,
      seller,
    };
    console.log(res);
    return res;
  });

  const lowest = getLowestPricedItem(listings.filter((el) => el.isMint));

  const releaseDetails = {
    listings,
    lowest_price: lowest.combinedPrice,
    title: release.title,
  };
  return releaseDetails;
}

async function createIssue(title, body) {
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body }),
  });

  if (!response.ok) {
    const errorMsg = await response.text();
    throw new Error(
      `GitHub API responded with a status of ${response.status}: ${errorMsg}`
    );
  }

  const issue = await response.json();
  console.log(`Issue created: ${issue.html_url}`);
}

async function listOpenIssues() {
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues?state=open`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    const errorMsg = await response.text();
    throw new Error(
      `GitHub API responded with a status of ${response.status}: ${errorMsg}`
    );
  }

  const issues = await response.json();
  if (issues.length === 0) {
    console.log("No open issues found.");
    return;
  }

  console.log("Open issues:");
  issues.forEach((issue) => {
    console.log(`- ${issue.title} (#${issue.number}): ${issue.html_url}`);
  });

  return issues;
}

async function checkGitHubIssue(title) {
  const issues = await listOpenIssues();
  const issue = issues?.find((issue) => issue.title === title);

  return !!issue;
}

export default async function handler(req, res) {
  // Ensure this API route only responds to GET requests
  if (req.method !== "GET") {
    return res.status(405).end(); // Method Not Allowed
  }

  try {
    const listResponse = await getList("1503851");
    const releases = listResponse.items.filter((el) => el.comment.length); // Simplification, adjust based on actual API response structure

    const result = await Promise.all(
      releases.slice(0, 1).map(async (release) => {
        const releaseId = release.id;
        const releaseDetails = await getRelease(releaseId);
        const lowest_price = releaseDetails.lowest_price;
        const target_price = Number(release.comment);
        console.log({
          title: releaseDetails.title,
          target_price,
          lowest_price,
        });
        const isCheaper = lowest_price >= target_price;

        if (isCheaper) {
          const issueExists = await checkGitHubIssue(releaseDetails.title);

          if (!issueExists) {
            await createIssue(releaseDetails.title, releaseDetails.uri);
          } else {
            console.log("already there");
          }
        }

        return {
          title: releaseDetails.title,
          target_price,
          lowest_price,
          isCheaper,
          releaseDetails,
        };
      })
    );

    res.status(200).json({ message: "Process completed", result });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "An error occurred", error: error.message });
  }
}
