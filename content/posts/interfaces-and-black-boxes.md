+++
date = '2025-10-26T21:09:07+08:00'
draft = false
title = '接口、黑箱、契约编程与命名规范'
+++

## 引言

之前接触Java时，总是感觉接口（Interface）这种东西好像很鸡肋，有点抽象——为什么要在具体实现之外再多写一个抽象层呢？直到前几天写Golang Web服务，在死抠[分层设计与代码规范](./reflections-on-layered-architecture.md)时，才终于明白接口的价值所在。于是，我打算把一些思考和体会记录在这篇文章里。

## 什么是接口？

接口（Interface）本质上是一种**契约**，它定义了一组方法的签名（方法名、参数类型、返回值类型），而不包含具体的实现细节。**你必须实现这些方法，才能被认为是这个接口的实现者**。

顾名思义，所谓接口，就是一个“黑盒子”与外界交互的“接口”。它以*输入与输出*这种抽象的形式定义了模块的功能，而隐藏了模块的内部实现细节。在使用这个接口时，只需要知道它的定义就可以调用它，而不需要关心它的具体实现。契约编程（Design by Contract）正是基于这种思想：模块之间通过接口进行通信，遵循预定义的契约，从而实现模块间的解耦。

至于契约编程与黑箱思维的价值，我在[为什么要做分层架构](./reflections-on-layered-architecture.md#为什么要做分层架构)一节中已经详细阐述过了，这里就不赘述了。

## 接口的命名规范

接口的命名应当简洁明了，能够准确反映接口的职责和功能；而实现接口的具体类或结构体，则可以根据其具体功能进行命名。例如，如果有一个 `Reader` 接口，那么实现它的类可以命名为 `FileReader`、`NetworkReader` 等。

值得一提的是，在 Golang 中有一种优雅而巧妙的命名方式：如果 `SomeThing` 接口只有一个默认实现，那么这个实现可以直接命名为 `someThing`。它不仅避免了冗余的命名、清晰地表达了实现与接口之间的关系，而且保证了外部包只能调用到 `SomeThing` 接口，而无法直接访问 `someThing` 具体实现。这种依赖接口而非具体实现的设计，进一步提升了代码的解耦性和灵活性。

```go
// 定义接口
type AuthUsecase interface {
	CasLogin(ctx context.Context, ticket string) (*LoginResult, *errors.Error)
}

// 定义具体实现
type authUsecase struct {
	// 结构体字段...
}

func (uc *authUsecase) CasLogin(ctx context.Context, ticket string) (*LoginResult, *errors.Error) {
    // 方法实现...
}
```

## 总结

接口作为契约编程中的重要组成部分，通过定义模块间的交互方式，实现了模块的解耦和灵活性。

合理的接口命名规范不仅提升了代码的可读性和维护性，还能有效地传达接口的职责和功能。