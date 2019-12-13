import tl = require('azure-pipelines-task-lib/task');
import gitP = require('simple-git/promise');
import url = require('url');
import shell = require("shelljs");
import fs = require('fs');
import path = require('path');

async function InitRepo(git : gitP.SimpleGit, gheRepoUrl : string, acceptUntrustedCerts : boolean = false, authHeader : string = "") {
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
    
    tl.debug(`Adding new remote for origin at '${gheRepoUrl}'.`);
    // Add the git remote repo
    await git.addRemote('origin', gheRepoUrl);

    tl.debug('fetching remote origin.');
    const fetchArgs : Array<string> = [
        '--tags', 
        '--prune', 
        '--progress',
        '--no-recurse-submodules',
        'origin'
    ];

    if(!acceptUntrustedCerts)
    {
        tl.debug('Allow untrusted Certs for git.');
        // We should get this from the GHE Service Endpoint configuration!
        //fetchArgs.unshift('-c http.sslVerify=false');
        await git.addConfig('http.sslVerify', 'false');
    }

    // Do we have an auth header? if so set http.extraheader for this command
    if(authHeader)
    {
        tl.debug('Adding Auth Header.');
        //fetchArgs.unshift('-c http.extraheader="AUTHORIZATION: ' + authHeader +'"');
        await git.addConfig('http.extraheader', 'AUTHORIZATION: ' + authHeader);
    }

    // Fetch git repo from origin
    await git.fetch(fetchArgs); 
    // tl.debug('git ' + fetchArgs.join(' '));
    // await git.raw(fetchArgs);

    tl.debug('Git repository initialization completed succesfully.');
}

async function run() {
    console.log(`Downloading artifact.`);
    try {
        const connection : string | undefined = tl.getInput("connection", false);
        const repository: string | undefined = tl.getInput("definition", false);
        const branch: string | undefined = tl.getInput("branch", false);
        const commitId: string | undefined = tl.getInput("version", false);
        const downloadPath: string | undefined = tl.getInput("downloadPath", false);

        if(!connection)
        {
            throw new Error("Invalid service endpoint.");
        }
        
        const hostUrl : string | undefined = tl.getEndpointUrl(connection, false);        
        const auth: tl.EndpointAuthorization | undefined = tl.getEndpointAuthorization(connection, false);

        if(!auth) {
            throw new Error("DownloadArtifactsGitHubEnterprise sample task supports only GitHub PAT."); 
        }

        const password : string | undefined = auth.parameters["password"];
        const username : string | undefined = auth.parameters["username"];
        const apitoken : string | undefined = auth.parameters["apitoken"];
        const acceptUntrustedCerts: boolean = (/true/i).test(auth.parameters["acceptUntrustedCerts"]);

        if(!downloadPath)
        {
            throw new Error("Invalid downloadPath.");
        }

        if(!commitId)
        {
            throw new Error("Invalid version.");
        }

        // Make sure we have Git client
        var gitPath : string | undefined = tl.which('git', false);
        if(!gitPath)
        {
            if(process.env.AGENT_HOMEDIRECTORY)
            {
                // In the case when the git client doesnt exist in path we should look in agent externals folder
                gitPath = path.join(process.env.AGENT_HOMEDIRECTORY, "externals", "git", "cmd", "git.exe");
            }
        }

        if(!gitPath || !fs.existsSync(gitPath))
            throw new Error('git not found. Please ensure installed and in the agent path');

        tl.debug(`Checking if downloadPath folder '${downloadPath}' exists.`);
        // Create the repo folder if doesnt exist
        if (!fs.existsSync(downloadPath)) {
            tl.debug('downloadPath folder does not exist therefore creating folder.');
            shell.mkdir(downloadPath);
        }        

        var gheRepo = url.parse(`${ hostUrl }${ repository }.git`)
        var gheRepoUrl = url.format(gheRepo)

        let authHeader : string = "";
        if (username && password) {
            authHeader = `basic ${Buffer.from(username + ':' + password).toString('base64')}`;
        }
        else if (apitoken) {
            authHeader = `basic ${Buffer.from('pat:' + apitoken).toString('base64')}`
        }
        else
        {
            throw new Error('unsupported authentication method!');
        }

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
        await InitRepo(git, gheRepoUrl, acceptUntrustedCerts, authHeader);

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