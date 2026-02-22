using System.Collections.Generic;
using System.Linq;
using Mono.Cecil;

namespace TerrariaPatcherBridge
{
    class MyAssemblyResolver : BaseAssemblyResolver
    {
        private readonly string _extraDirectory;

        public MyAssemblyResolver(string extraDirectory)
        {
            this._extraDirectory = extraDirectory;
        }

        protected override AssemblyDefinition SearchDirectory(AssemblyNameReference name, IEnumerable<string> directories, ReaderParameters parameters)
        {
            var validDirectories = directories.Where(d => !string.IsNullOrEmpty(d)).ToList();
            if (!string.IsNullOrEmpty(_extraDirectory)) 
            {
                validDirectories.Add(_extraDirectory);
            }
            return base.SearchDirectory(name, validDirectories, parameters);
        }
    }
}
