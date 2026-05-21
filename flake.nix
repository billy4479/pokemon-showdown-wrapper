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

        pokemon-showdown-wrapper = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "pokemon-showdown-wrapper";
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
            mkdir -p $out/share/pokemon-showdown-wrapper

            # Copy compiled JS
            cp -r dist package.json pnpm-lock.yaml pnpm-workspace.yaml $out/share/pokemon-showdown-wrapper

            mkdir -p $out/bin
            makeWrapper ${pkgs.nodejs_latest}/bin/node $out/bin/list-allowed-moves \
              --add-flags "$out/share/pokemon-showdown-wrapper/dist/list-allowed-moves.js"
            makeWrapper ${pkgs.nodejs_latest}/bin/node $out/bin/showdown-wrapper \
              --add-flags "$out/share/pokemon-showdown-wrapper/dist/showdown-wrapper.js"

            cd $out/share/pokemon-showdown-wrapper
            pnpm install --prod --offline --frozen-lockfile --node-linker=hoisted
            rm package.json pnpm-lock.yaml pnpm-workspace.yaml
          '';

          meta.mainProgram = "showdown-wrapper";
        });
      in
      {
        packages.default = pokemon-showdown-wrapper;
        packages.pokemon-showdown-wrapper = pokemon-showdown-wrapper;

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            typescript-language-server
          ];

          nativeBuildInputs = with pkgs; [
            nodejs_latest
            pnpm
            pyPkgs
          ];

          inputsFrom = [ pokemon-showdown-wrapper ];
        };
      }
    );
}
