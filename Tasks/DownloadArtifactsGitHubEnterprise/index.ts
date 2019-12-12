import tl = require('azure-pipelines-task-lib/task');
import gitP = require('simple-git/promise');
import url = require('url');
import shell = require("shelljs");
import fs = require('fs');

async function InitRepo(git : gitP.SimpleGit, gheRepoUrl:string) {
    tl.debug('Initializing git repository.');
    // Init the git repo folder
    await git.init();

    tl.debug('Disabling git house keeping tasks.');
    // Disable the git housekeeping tasks - https://git-scm.com/docs/git-gc/2.12.0#_options
    await git.addConfig('gc.auto', '0');

    tl.debug('Getting agent proxy configuration.');
    // Get the proxy configured for the DevOps Agent
    const proxy : tl.ProxyConfiguration | null = tl.getHttpProxyConfiguration();
    // Is a Proxy set?
    if(proxy)
    {
        tl.debug('Agent proxy is set.');

        // Get THe proxy Url
        var proxyUrl = url.parse(proxy.proxyUrl);

        // Is this needed? or is this already included in the url?
        if (proxy.proxyUsername && proxy.proxyPassword) {
            proxyUrl.auth = proxy.proxyUsername + ':' + proxy.proxyPassword;
        }
        
        tl.debug('Configuring git proxy.');
        // Set the proxy for git
        await git.addConfig("http.proxy", url.format(proxyUrl));
    }

    tl.debug('Getting git config for credential-helper.');
    // Make sure we are not using credential helper as the interactive prompt as blocks this task
    const data = await git.raw(
        [
            'config',
            '--get',
            'credential.helper'
        ]);
    
    if(data && data.trim() !== "")
    {
        throw new Error('If credential helper is enabled the interactive prompt can block this task.');
    }
    
    tl.debug('Setting git config http.sslVerify.');
    // We should get this from the GHE Service Endpoint configuration!
    await git.addConfig('http.sslVerify', 'false');

    tl.debug(`Adding new remote for origin at '${gheRepoUrl}'.`);
    // Add the git remote repo
    await git.addRemote('origin', gheRepoUrl);

    tl.debug('fetching remote origin.');
    // Fetch git repo from origin
    await git.fetch([
        '--tags', 
        '--prune', 
        '--progress',
        '--no-recurse-submodules',
        'origin'
    ]); 
    tl.debug('Git repository initialization completed succesfully.');
}

async function run() {
    console.log(`Downloading artifact.`);
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
            tl.debug('downloadPath folder does not exist therefore creating folder.');
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

        tl.debug(`GitHub Enterprise Repo url is '${gheRepoUrl}'.`);

        const git = gitP(downloadPath)
                        .silent(true)
                        .customBinary(gitPath)
                        .outputHandler((command, stdout, stderr) => {
                            stdout.pipe(process.stdout);
                            stderr.pipe(process.stderr);
                         });

        tl.debug('Checking git version.');
        // Query Git client version
        await git.raw(
        [
            'version'
        ]);

        // Init local repo at the download path
        await InitRepo(git, gheRepoUrl);

        tl.debug(`Starting git checkout for desired commit - ${commitId}`);
        // Checkout the specific commit from the repo
        const result = await git.checkout([
            '--progress', 
            '--force', 
            commitId
        ]);

        tl.debug(`Completed git checkout for desired commit - ${commitId}`);
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
    console.log(`Downloading artifact completed.`);
}

run();