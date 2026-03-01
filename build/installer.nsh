!macro customInit
  RMDir /r "$INSTDIR\resources\patcher-edge-js"
  RMDir /r "$INSTDIR\resources\app.asar.unpacked\node_modules\electron-edge-js"

  Delete "$INSTDIR\resources\patcher-bridge"
  Delete "$INSTDIR\resources\patcher-bridge\TerrariaPatcherBridge.dll"
  Delete "$INSTDIR\resources\patcher-bridge\TerrariaPatcherBridge.exe"
  Delete "$INSTDIR\resources\patcher-bridge\TerrariaPatcherBridge"
  Delete "$INSTDIR\resources\patcher-bridge\TerrariaPatcherBridge.deps.json"
  Delete "$INSTDIR\resources\patcher-bridge\TerrariaPatcherBridge.runtimeconfig.json"
  Delete "$INSTDIR\resources\patcher-bridge\Mono.Cecil.dll"
  Delete "$INSTDIR\resources\patcher-bridge\Mono.Cecil.Rocks.dll"
  Delete "$INSTDIR\resources\patcher-bridge\Mono.Cecil.pdb"
  Delete "$INSTDIR\resources\patcher-bridge\Mono.Cecil.Rocks.pdb"
  Delete "$INSTDIR\resources\patcher-bridge\TerrariaPatcherBridge.pdb"
!macroend
