<?php

$options = getopt("", ["file:", "cwd:"]);
$tempFile = $options['file'] ?? '';
$cwd = $options['cwd'] ?? getcwd();

if (!file_exists($tempFile)) {
    echo json_encode(["status" => "error", "message" => "Temp file not found", "suggestions" => [], "instruction" => ""]);
    exit(1);
}

$code = file_get_contents($tempFile);

$autoloadPath = rtrim($cwd, '/') . '/vendor/autoload.php';
if (file_exists($autoloadPath)) {
    require_once $autoloadPath;
}

// 1. Syntax Check
$lintOutput = [];
$returnVar = 0;
exec("php -l " . escapeshellarg($tempFile) . " 2>&1", $lintOutput, $returnVar);

if ($returnVar !== 0) {
    echo json_encode([
        "status" => "error",
        "message" => "[Syntax Error] " . implode(" ", $lintOutput),
        "suggestions" => [],
        "instruction" => "Fix the PHP syntax error before attempting to guess methods."
    ]);
    exit(0);
}

function fuzzy_suggest_methods($className, $methodName) {
    if (!class_exists($className) && !interface_exists($className)) return [];
    try {
        $ref = new ReflectionClass($className);
        $methods = $ref->getMethods();
        $suggestions = [];
        foreach ($methods as $m) {
            $name = $m->getName();
            $dist = levenshtein($methodName, $name);
            if ($dist < 4) {
                $suggestions[$name] = $dist;
            }
        }
        asort($suggestions);
        return array_slice(array_keys($suggestions), 0, 3);
    } catch (Exception $e) {
        return [];
    }
}

function fuzzy_suggest_classes($className) {
     $available = get_declared_classes();
     $suggestions = [];
     foreach ($available as $c) {
         $shortName = basename(str_replace('\\', '/', $c));
         $dist = levenshtein($className, $shortName);
         if ($dist < 3) {
             $suggestions[$c] = $dist;
         }
     }
     asort($suggestions);
     return array_slice(array_keys($suggestions), 0, 3);
}

$tokens = token_get_all($code);
$varTypes = [];

if (!defined('T_NAME_QUALIFIED')) {
    define('T_NAME_QUALIFIED', 314);
}
if (!defined('T_NAME_FULLY_QUALIFIED')) {
    define('T_NAME_FULLY_QUALIFIED', 313);
}

for ($i = 0; $i < count($tokens); $i++) {
    $token = $tokens[$i];
    
    // Parse PHPDoc
    if (is_array($token) && $token[0] === T_DOC_COMMENT) {
        if (preg_match('/@var\s+([a-zA-Z0-9_\\\\]+)\s+(\$[a-zA-Z0-9_]+)/', $token[1], $matches)) {
            $varTypes[$matches[2]] = ltrim($matches[1], '\\');
        }
    }
    
    // Parse $var = new Class()
    if (is_array($token) && $token[0] === T_VARIABLE) {
        $varName = $token[1];
        $j = $i + 1;
        while (isset($tokens[$j]) && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j++;
        if (isset($tokens[$j]) && $tokens[$j] === '=') {
            $j++;
            while (isset($tokens[$j]) && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j++;
            if (isset($tokens[$j]) && is_array($tokens[$j]) && $tokens[$j][0] === T_NEW) {
                $j++;
                while (isset($tokens[$j]) && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j++;
                if (isset($tokens[$j]) && is_array($tokens[$j]) && ($tokens[$j][0] === T_STRING || $tokens[$j][0] === T_NAME_QUALIFIED || $tokens[$j][0] === T_NAME_FULLY_QUALIFIED)) {
                    $varTypes[$varName] = ltrim($tokens[$j][1], '\\');
                }
            }
        }
    }

    // Check T_NEW ClassName
    if (is_array($token) && $token[0] === T_NEW) {
        $j = $i + 1;
        while (isset($tokens[$j]) && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j++;
        if (isset($tokens[$j]) && is_array($tokens[$j]) && ($tokens[$j][0] === T_STRING || $tokens[$j][0] === T_NAME_QUALIFIED || $tokens[$j][0] === T_NAME_FULLY_QUALIFIED)) {
            $className = ltrim($tokens[$j][1], '\\');
            if ($className !== 'self' && $className !== 'static' && !class_exists($className) && !interface_exists($className) && $className !== 'stdClass') {
                echo json_encode([
                    "status" => "error",
                    "message" => "[Class Error] Class '$className' not found.",
                    "suggestions" => fuzzy_suggest_classes(basename(str_replace('\\', '/', $className))),
                    "instruction" => "Compare these suggestions. If none match, inform the user."
                ]);
                exit(0);
            }
        }
    }

    // Check Static methods (ClassName::method)
    if (is_array($token) && $token[0] === T_DOUBLE_COLON) {
        $j = $i - 1;
        while (isset($tokens[$j]) && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j--;
        if (isset($tokens[$j]) && is_array($tokens[$j]) && ($tokens[$j][0] === T_STRING || $tokens[$j][0] === T_NAME_QUALIFIED || $tokens[$j][0] === T_NAME_FULLY_QUALIFIED)) {
            $className = ltrim($tokens[$j][1], '\\');
            $k = $i + 1;
            while (isset($tokens[$k]) && is_array($tokens[$k]) && $tokens[$k][0] === T_WHITESPACE) $k++;
            if (isset($tokens[$k]) && is_array($tokens[$k]) && $tokens[$k][0] === T_STRING && $className !== 'self' && $className !== 'static' && $className !== 'parent') {
                $methodName = $tokens[$k][1];
                if (class_exists($className) && !method_exists($className, $methodName)) {
                    echo json_encode([
                        "status" => "error",
                        "message" => "[Method Error] Static method '$methodName' does not exist on class '$className'.",
                        "suggestions" => fuzzy_suggest_methods($className, $methodName),
                        "instruction" => "Check suggestions for static method naming."
                    ]);
                    exit(0);
                }
            }
        }
    }

    // Check Instance methods ($var->method)
    if (is_array($token) && $token[0] === T_OBJECT_OPERATOR) {
        $j = $i - 1;
        while (isset($tokens[$j]) && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j--;
        if (isset($tokens[$j]) && is_array($tokens[$j]) && $tokens[$j][0] === T_VARIABLE) {
            $varName = $tokens[$j][1];
            if (isset($varTypes[$varName])) {
                $className = $varTypes[$varName];
                $k = $i + 1;
                while (isset($tokens[$k]) && is_array($tokens[$k]) && $tokens[$k][0] === T_WHITESPACE) $k++;
                if (isset($tokens[$k]) && is_array($tokens[$k]) && $tokens[$k][0] === T_STRING) {
                    $methodName = $tokens[$k][1];
                    if (class_exists($className) && !method_exists($className, $methodName)) {
                        echo json_encode([
                            "status" => "error",
                            "message" => "[Method Error] Instance method '$methodName' does not exist on type '$className' (Resolved from $varName).",
                            "suggestions" => fuzzy_suggest_methods($className, $methodName),
                            "instruction" => "Check suggestions for instance method naming."
                        ]);
                        exit(0);
                    }
                }
            }
        }
    }
}

echo json_encode([
    "status" => "success",
    "message" => "Valid: The code appears syntactically correct and documented types/methods resolve successfully.",
    "suggestions" => [],
    "instruction" => "You may proceed."
]);
exit(0);
