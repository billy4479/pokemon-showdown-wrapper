{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        lib = nixpkgs.lib;
        pkgs = nixpkgs.legacyPackages.${system};

        pyPkgs = pkgs.python3.withPackages (
          python-pkgs: with python-pkgs; [
            python-lsp-server
            python-lsp-ruff
          ]
        );

        showdownJsWorker = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "showdown-js-worker";
          version = "1.0.0";

          src = pkgs.nix-gitignore.gitignoreSource [ ] ./.;

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) src;
            pname = finalAttrs.pname;
            fetcherVersion = 3;
            hash = "sha256-FEopSW6Ty6vXC+2mqf2LvyUIj8pGo3m9trujIhXwBN0=";
          };

          nativeBuildInputs = with pkgs; [
            nodejs_latest
            pnpm
            pnpmConfigHook
            makeWrapper
          ];

          buildPhase = ''
            pnpm build
          '';

          installPhase = ''
            mkdir -p $out/share/showdown-js-worker

            cp -r dist package.json pnpm-lock.yaml pnpm-workspace.yaml $out/share/showdown-js-worker

            mkdir -p $out/bin
            makeWrapper ${pkgs.nodejs_latest}/bin/node $out/bin/list-allowed-moves \
              --add-flags "$out/share/showdown-js-worker/dist/list-allowed-moves.js"
            makeWrapper ${pkgs.nodejs_latest}/bin/node $out/bin/showdown-wrapper \
              --add-flags "$out/share/showdown-js-worker/dist/showdown-wrapper.js"

            cd $out/share/showdown-js-worker
            pnpm install --prod --offline --frozen-lockfile --node-linker=hoisted
            rm package.json pnpm-lock.yaml pnpm-workspace.yaml
          '';

          meta.mainProgram = "showdown-wrapper";
        });

        showdownPyClient = pkgs.python3.pkgs.buildPythonPackage {
          pname = "showdown-wrapper";
          version = "0.1.0";

          src = pkgs.nix-gitignore.gitignoreSource [ ] ./.;

          pyproject = true;

          postPatch = ''
            cat > showdown_wrapper/_build_data.py <<EOF
            DEFAULT_WORKER_PATH = "${showdownJsWorker}/bin/showdown-wrapper"
            EOF
          '';

          nativeBuildInputs = [
            (pkgs.python3.withPackages (
              python-pkgs: with python-pkgs; [
                setuptools
                wheel
              ]
            ))
          ];

          propagatedBuildInputs = [ showdownJsWorker ];

          meta = with lib; {
            description = "Python client for showdown-js-worker stdio protocol";
            license = licenses.mit;
          };
        };
      in
      {
        packages = {
          default = showdownPyClient;
          showdown-js-worker = showdownJsWorker;
          showdown-py-client = showdownPyClient;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            typescript-language-server
          ];

          nativeBuildInputs = with pkgs; [
            nodejs_latest
            pnpm
            pyPkgs
          ];

          inputsFrom = [
            showdownJsWorker
            showdownPyClient
          ];
        };
      }
    );
}
