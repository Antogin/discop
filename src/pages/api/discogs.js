import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

const githubToken = process.env.GITHUB_TOKEN;
const repoOwner = process.env.REPO_OWNER;
const repoName = process.env.REPO_NAME;
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const from = process.env.TWILIO_WHATSAPP_FROM;
const to = process.env.TWILIO_WHATSAPP_TO; 

console.log('xxxx', process.env);
async function sendWhatsAppMessage(messageTxt) {
  try {
    const message = await client.messages.create({
      body: messageTxt,
      from,
      to,
    });
    console.log(`Message sent: ${message.sid}`);
  } catch (error) {
    console.error(`Failed to send message: ${error.message}`);
  }
}


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

  console.log(releaseId)
  return fetch(`https://api.discogs.com/releases/${releaseId}`, options).then(
    (response) => response.json()
  );
}

async function createIssue(title, body) {
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body }),
  });

  if (!response.ok) {
    const errorMsg = await response.text();
    throw new Error(`GitHub API responded with a status of ${response.status}: ${errorMsg}`);
  }

  const issue = await response.json();
  console.log(`Issue created: ${issue.html_url}`);
}

async function listOpenIssues() {
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues?state=open`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    const errorMsg = await response.text();
    throw new Error(`GitHub API responded with a status of ${response.status}: ${errorMsg}`);
  }

  const issues = await response.json();
  if (issues.length === 0) {
    console.log('No open issues found.');
    return;
  }

  console.log('Open issues:');
  issues.forEach(issue => {
    console.log(`- ${issue.title} (#${issue.number}): ${issue.html_url}`);
  });

  return issues;
}

async function checkGitHubIssue(title) {
  const issues = await listOpenIssues();
  const issue = issues?.find(issue => issue.title === title)

  return !!issue;
}

export default async function handler(req, res) {
  // Ensure this API route only responds to GET requests
  if (req.method !== "GET") {
    return res.status(405).end(); // Method Not Allowed
  }

  console.log('ENV ', process.env);


  try {
    const listResponse = await getList("1503851");
    const releases = listResponse.items.filter((el) => el.comment.length); // Simplification, adjust based on actual API response structure

    await Promise.all(releases.map(async release => {
      const releaseId = release.id; 
      const releaseDetails = await getRelease(releaseId);
      const lowest_price = releaseDetails.lowest_price;
      const target_price = Number(release.comment);
      console.log({ title: releaseDetails.title, target_price, lowest_price});
      const isCheaper = lowest_price <= target_price; 

      if (isCheaper) {
        const issueExists = await checkGitHubIssue(releaseDetails.title);

        if (!issueExists) {
          await createIssue(releaseDetails.title, releaseDetails.uri);

          sendWhatsAppMessage(`New drop for ${releaseDetails.title} ${releaseDetails.uri}`)
        } else {
          console.log('already there')
        }
      }
    }));

    res.status(200).json({ message: "Process completed" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "An error occurred", error: error.message });
  }
}
