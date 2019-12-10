import tl = require('azure-pipelines-task-lib/task');
import gitP = require('simple-git/promise');
import url = require('url');
import shell = require("shelljs");
import fs = require('fs');

async function InitRepo(git : gitP.SimpleGit, gheRepoUrl:string) {
    const promise = new Promise((resolve, reject) => {
        // the resolve / reject functions control the fate of the promise
        git.init()
            .then(() => {
                // Add the git remote repo
                git.addRemote('origin', gheRepoUrl)
                    .then(() => {
                    tl.debug(`Added new remote for origin at '${gheRepoUrl}'.`);
                    // Disable the git housekeeping tasks - https://git-scm.com/docs/git-gc/2.12.0#_options
                    git.addConfig('gc.auto', '0')
                        .catch((err : any) => {
                            reject(new Error(`git.addConfig gc.auto 0 failed with error ${ err }`));
                        });
                    
                    git.addConfig('http.sslVerify', 'false')
                        .catch((err : any) => {
                            reject(new Error(`git.addConfig http.sslVerify failed with error ${ err }`));
                        });
                    
                    // git.addConfig('http.extraheader', `AUTHORIZATION: basic ${ apitoken }`)
                    //     .catch((err : any) => {
                    //         reject(new Error(`git.addConfig http.extraheader failed with error ${ err }`));
                    //     });

                    return git.fetch([
                        '--tags', 
                        '--prune', 
                        '--progress',
                        '--no-recurse-submodules',
                        'origin'
                    ]).then(() => {
                        resolve();
                    }).catch((err : any) => {
                        reject(`git.fetch failed with error ${ err }`);
                    });
                    
                }).catch((err : any) => {
                    reject(new Error(`git.addRemote failed with error ${ err }`));
                });
        })
        .catch((err : any) => {
            reject(new Error(`git.init failed with error ${ err }`));
        });
    });
    return promise;
}

async function run() {
    try {
        const connection : string | undefined = tl.getInput("connection");
        const repository: string | undefined = tl.getInput("definition");
        const branch: string | undefined = tl.getInput("branch");
        const commitId: string | undefined = tl.getInput("version");
        const downloadPath: string | undefined = tl.getInput("downloadPath");

        if(!connection)
        {
            throw new Error("DownloadArtifactsGitHubEnterprise sample task requires a valid Service Connection for Github Enterprise.");          
        }

        const hostUrl : string | undefined = tl.getEndpointUrl(connection, false);

        if(!hostUrl)
        {
            throw new Error("DownloadArtifactsGitHubEnterprise sample task requires a valid hostUrl for its Service Connection for Github Enterprise.");       
        }
        
        const auth = tl.getEndpointAuthorization(connection, false);
        if(!auth) {
            throw new Error("DownloadArtifactsGitHubEnterprise sample task supports only GitHub PAT."); 
        }

        const password : string | undefined = auth.parameters["password"];
        const username : string | undefined = auth.parameters["username"];
        const apitoken : string | undefined = auth.parameters["apitoken"];

        if(!repository)
        {
            throw new Error("DownloadArtifactsGitHubEnterprise sample task requires a valid Repository for Github Enterprise.");         
        }

        if(!branch)
        {
            throw new Error("DownloadArtifactsGitHubEnterprise sample task requires a valid branch for Github Enterprise.");        
        }

        if(!commitId)
        {
            throw new Error("DownloadArtifactsGitHubEnterprise sample task requires a valid commit for Github Enterprise.");   
        }

        if(!downloadPath)
        {
            throw new Error("DownloadArtifactsGitHubEnterprise sample task requires a valid commit for Github Enterprise.");      
        }

        // Make sure we have Git client
        var gitPath : string | undefined = tl.which('git', false);
        if(!gitPath)
        {
            // In the case when the git client doesnt exist in path we should look in agent externals folder
            // var agentGit = path.join(rootDirectory, "externals", "git", "cmd", "git.exe");
            throw new Error('git not found. Please ensure installed and in the agent path');
        }

        tl.debug(`Checking if downloadPath folder '${downloadPath}' exists.`);
        // Create the repo folder if doesnt exist
        if (!fs.existsSync(downloadPath)) {
            tl.debug(`downloadPath folder '${downloadPath}' does not exist therefore creating folder.`);
            shell.mkdir(downloadPath);
        }        

        // Make sure we inject the PAT for authentication
        var gheRepo = url.parse(`${ hostUrl }${ repository }.git`)
        if (username && password) {
              gheRepo.auth = username + ':' + password;
        }else if (apitoken) {
              gheRepo.auth = 'dummyuser:' + apitoken;
        }
        var gheRepoUrl = url.format(gheRepo)

        tl.debug(`GitHub Enterprise Repo url is '${gheRepoUrl}'`);

        const git = gitP(downloadPath)
                        .silent(true)
                        .customBinary(gitPath)
                        .outputHandler((command, stdout, stderr) => {
                            stdout.on(
                                'data',
                                (data) => {
                                    tl.debug(data);
                                });
                            stderr.on(
                                'data',
                                (data) => {
                                    tl.debug(data);
                                });
                         });

        // Query Git client version
        git.raw(
        [
            'version'
        ])
        .catch((err : any) => {
            tl.error(`git.raw.version failed with error ${ err }`);
        });

        console.log(`Downloading artifact.`);
        // Init local repo at the download path
        InitRepo(git, gheRepoUrl).then(()=>{
            git.checkout([
                '--progress', 
                '--force', 
                branch,
                commitId
            ])
            .then(() => {
                console.log(`Downloading artifact completed.`);
            })
            .catch((err : any) => {
                throw new Error(`git.checkout failed with error ${ err }`);
            }); 
        })
        .catch((err : Error) => {
            throw err;
        });

    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
}

run();