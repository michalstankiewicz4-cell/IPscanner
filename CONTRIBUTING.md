# Setting guidelines for repository contributors

You can create guidelines to communicate how people should contribute to your project.

## About contributing guidelines

To help your project contributors do good work, you can add a file with contribution guidelines to your project repository's root, `docs`, or `.github` folder. When someone opens a pull request or creates an issue, they will see a link to that file. The link to the contributing guidelines also appears on your repository's `contribute` page. For an example of a `contribute` page, see [github/docs/contribute](https://github.com/github/docs/contribute).

If your repository includes a `CONTRIBUTING.md` file, GitHub also surfaces it in two other places to make it easier for contributors to discover:

* A "<svg version="1.1" width="16" height="16" viewBox="0 0 16 16" class="octicon octicon-people" aria-label="people" role="img"><path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z"></path></svg> Contributing" tab in the repository overview (next to the "<svg version="1.1" width="16" height="16" viewBox="0 0 16 16" class="octicon octicon-book" aria-label="book" role="img"><path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z"></path></svg> README" and "<svg version="1.1" width="16" height="16" viewBox="0 0 16 16" class="octicon octicon-code-of-conduct" aria-label="code-of-conduct" role="img"><path d="M8.048 2.241c.964-.709 2.079-1.238 3.325-1.241a4.616 4.616 0 0 1 3.282 1.355c.41.408.757.86.996 1.428.238.568.348 1.206.347 1.968 0 2.193-1.505 4.254-3.081 5.862-1.496 1.526-3.213 2.796-4.249 3.563l-.22.163a.749.749 0 0 1-.895 0l-.221-.163c-1.036-.767-2.753-2.037-4.249-3.563C1.51 10.008.007 7.952.002 5.762a4.614 4.614 0 0 1 1.353-3.407C3.123.585 6.223.537 8.048 2.24Zm-1.153.983c-1.25-1.033-3.321-.967-4.48.191a3.115 3.115 0 0 0-.913 2.335c0 1.556 1.109 3.24 2.652 4.813C5.463 11.898 6.96 13.032 8 13.805c.353-.262.758-.565 1.191-.905l-1.326-1.223a.75.75 0 0 1 1.018-1.102l1.48 1.366c.328-.281.659-.577.984-.887L9.99 9.802a.75.75 0 1 1 1.019-1.103l1.384 1.28c.295-.329.566-.661.81-.995L12.92 8.7l-1.167-1.168c-.674-.671-1.78-.664-2.474.03-.268.269-.538.537-.802.797-.893.882-2.319.843-3.185-.032-.346-.35-.693-.697-1.043-1.047a.75.75 0 0 1-.04-1.016c.162-.191.336-.401.52-.623.62-.748 1.356-1.637 2.166-2.417Zm7.112 4.442c.313-.65.491-1.293.491-1.916v-.001c0-.614-.088-1.045-.23-1.385-.143-.339-.357-.633-.673-.949a3.111 3.111 0 0 0-2.218-.915c-1.092.003-2.165.627-3.226 1.602-.823.755-1.554 1.637-2.228 2.45l-.127.154.562.566a.755.755 0 0 0 1.066.02l.794-.79c1.258-1.258 3.312-1.31 4.594-.032.396.394.792.791 1.173 1.173Z"></path></svg> Code of conduct")
* A "Contributing" link in the repository sidebar

For the repository owner, contribution guidelines are a way to communicate how people should contribute.

For contributors, the guidelines help them verify that they're submitting well-formed pull requests and opening useful issues.

For both owners and contributors, contribution guidelines save time and hassle caused by improperly created pull requests or issues that have to be rejected and re-submitted.

You can create default contribution guidelines for your organization or personal account. For more information, see [Creating a default community health file](/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file).

> \[!TIP]
> Repository maintainers can set specific guidelines for issues by creating an issue or pull request template for the repository. For more information, see [About issue and pull request templates](/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates).

## Adding a `CONTRIBUTING.md` file

1. On GitHub, navigate to the main page of the repository.

2. Above the list of files, select the **Add file** <svg version="1.1" width="16" height="16" viewBox="0 0 16 16" class="octicon octicon-triangle-down" aria-label="The downwards-facing triangle icon" role="img"><path d="m4.427 7.427 3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z"></path></svg> dropdown menu, then click **<svg version="1.1" width="16" height="16" viewBox="0 0 16 16" class="octicon octicon-plus" aria-label="plus" role="img"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"></path></svg> Create new file**.

   Alternatively, you can click <svg version="1.1" width="16" height="16" viewBox="0 0 16 16" class="octicon octicon-plus" aria-label="The plus sign icon" role="img"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"></path></svg> in the file tree view on the left.

   ![Screenshot of the main page of a repository highlighting both the "Add file" and the "plus sign" icon, described above, with an orange outline.](/assets/images/help/repository/add-file-buttons.png)

3. Decide whether to store your contributing guidelines in your repository's root, `docs`, or `.github` directory. Then, in the filename field, type the name and extension for the file. Contributing guidelines filenames are not case sensitive. Files are rendered in rich text format if the file extension is in a supported format. For more information, see [Working with non-code files](/en/repositories/working-with-files/using-files/working-with-non-code-files#rendering-differences-in-prose-documents).
   * To make your contributing guidelines visible in the repository's root directory, type *CONTRIBUTING*.
   * To make your contributing guidelines visible in the repository's `docs` directory, type *docs/* to create the new directory, then *CONTRIBUTING*.
   * If a repository contains more than one *CONTRIBUTING* file, then the file shown in links is chosen from locations in the following order: the `.github` directory, then the repository's root directory, and finally the `docs` directory.

4. In the new file, add contribution guidelines. These could include:
   * Steps for creating good issues or pull requests.
   * Links to external documentation, mailing lists, or a code of conduct.
   * Community and behavioral expectations.

5. Click **Commit changes...**

6. In the "Commit message" field, type a short, meaningful commit message that describes the change you made to the file. You can attribute the commit to more than one author in the commit message. For more information, see [Creating a commit with multiple authors](/en/pull-requests/committing-changes-to-your-project/creating-and-editing-commits/creating-a-commit-with-multiple-authors).

7. Below the commit message fields, decide whether to add your commit to the current branch or to a new branch. If your current branch is the default branch, you should choose to create a new branch for your commit and then create a pull request. For more information, see [Creating a pull request](/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request).

   ![Screenshot of a GitHub pull request showing a radio button to commit directly to the main branch or to create a new branch. New branch is selected.](/assets/images/help/repository/choose-commit-branch.png)

8. Click **Commit changes** or **Propose changes**.

## Examples of contribution guidelines

If you're stumped, here are some good examples of contribution guidelines:

* The GitHub Docs [contribution guidelines](/en/contributing).
* The Ruby on Rails [contribution guidelines](https://github.com/rails/rails/blob/main/CONTRIBUTING.md).
* The Open Government [contribution guidelines](https://github.com/opengovernment/opengovernment/blob/master/CONTRIBUTING.md).

## Further reading

* The Open Source Guides' section [Starting an Open Source Project](https://opensource.guide/starting-a-project/)
* [GitHub Skills](https://skills.github.com/)
* [Adding a license to a repository](/en/communities/setting-up-your-project-for-healthy-contributions/adding-a-license-to-a-repository)
