using System.Reflection;
using Terraria.UI;

namespace TranscendPlugins.Shared.Extensions
{
    public static class ItemTooltipExtensions
    {
        public static void SetValue(this ItemTooltip tooltip, string text)
        {
            var textField = typeof(ItemTooltip).GetField("_text", BindingFlags.NonPublic | BindingFlags.Instance);
            if (textField != null)
            {
                var textObj = textField.GetValue(tooltip);
                if (textObj != null)
                {
                    var setValueMethod = textObj.GetType().GetMethod("SetValue", BindingFlags.Public | BindingFlags.Instance);
                    if (setValueMethod != null)
                        setValueMethod.Invoke(textObj, new object[] { text });
                }
            }
            
            var validatorField = typeof(ItemTooltip).GetField("_validatorKey", BindingFlags.NonPublic | BindingFlags.Instance);
            if (validatorField != null)
            {
                validatorField.SetValue(tooltip, 0);
            }
        }
    }
}
