// @complexity fetchData:cyclomatic=3,cognitive=2
async function fetchData(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
}
