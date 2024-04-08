import axios from "axios";

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

export default async function handler(req, res) {
  // Ensure this API route only responds to GET requests
  if (req.method !== "GET") {
    return res.status(405).end(); // Method Not Allowed
  }

  try {
    // Fetch the list of releases (simplified, assuming a list of release IDs)
    const listResponse = await getList("1503851");
    const releases = listResponse.items.filter((el) => el.comment.length); // Simplification, adjust based on actual API response structure

    console.log(releases);

    for (const release of releases.slice(0,1)) {
      const releaseId = release.id; 
      const releaseDetails = await getRelease(releaseId);


      const lowest_price = releaseDetails.lowest_price;
      const target_price = Number(release.comment);

      console.log({target_price, lowest_price});

      // Simplified logic to determine if the lowest offer is cheaper
      const isCheaper = lowest_price <= target_price; // Placeholder logic

      if (isCheaper) {
        const issueExists = await checkGitHubIssue(releaseId);

        if (!issueExists) {
          await createGitHubIssue(releaseId);
          await sendWhatsAppMessage(releaseId);
        }
      }
    }

    res.status(200).json({ message: "Process completed" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "An error occurred", error: error.message });
  }
}
