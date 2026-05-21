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
        pkgs = nixpkgs.legacyPackages.${system};
        src = pkgs.lib.cleanSource ./.;
        pyPkgs = pkgs.python3.withPackages (
          python-pkgs: with python-pkgs; [
            python-lsp-server
            python-lsp-ruff
          ]
        );
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            typescript-language-server
          ];

          nativeBuildInputs = with pkgs; [
            nodejs_latest
            pnpm
            pyPkgs
          ];
        };
      }
    );
}
